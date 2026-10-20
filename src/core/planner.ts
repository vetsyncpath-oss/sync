import type {
  Baseline,
  FileInfo,
  Operation,
  Plan,
  Profile,
  Snapshot,
  Action,
} from "./model";
import { selected, validate, compatiblePaths } from "./paths";
export const policyKey = (p: Profile) =>
  JSON.stringify([
    p.direction,
    p.conflict,
    p.conflictWhen,
    p.deletion,
    p.deleteConflict,
    ...(p.oneWayMode === "mirror" ? ["mirror"] : []),
  ]);
export function plan(
  profile: Profile,
  local: Snapshot,
  remote: Snapshot,
  baseline: Baseline,
  config = ".obsidian",
): Plan {
  validate(profile);
  if (!local.complete || !remote.complete)
    throw Error(
      "Неполный список файлов: план не построен, удаления запрещены.",
    );
  compatiblePaths(local, remote);
  const identity = JSON.stringify([local.identity, remote.identity]);
  if (baseline.identity !== identity) baseline = { identity, files: {} };
  const operations: Operation[] = [];
  const add = (
    p: string,
    a: Action,
    reason: string,
    l?: FileInfo,
    r?: FileInfo,
  ) =>
    operations.push({
      id: crypto.randomUUID(),
      path: p,
      action: a,
      reason,
      local: l,
      remote: r,
    });
  for (const p of [
    ...new Set([
      ...Object.keys(local.files),
      ...Object.keys(remote.files),
      ...Object.keys(baseline.files),
    ]),
  ].sort()) {
    const l = Object.hasOwn(local.files, p) ? local.files[p] : undefined,
      r = Object.hasOwn(remote.files, p) ? remote.files[p] : undefined,
      b = Object.hasOwn(baseline.files, p) ? baseline.files[p] : undefined;
    if (
      !selected(p, profile, config, l?.size) ||
      !selected(p, profile, config, r?.size)
    )
      continue;
    const emit = (a: Action, why: string) => add(p, a, why, l, r);
    // Mirror is source-authoritative, including the first run. It is opt-in;
    // existing profiles keep the database-based, tracked-deletion semantics.
    if (profile.oneWayMode === "mirror") {
      const source = profile.direction === "pull" ? r : l;
      const target = profile.direction === "pull" ? l : r;
      if (!source && target)
        emit(
          profile.deletion === "ignore"
            ? "skip"
            : profile.direction === "pull"
              ? "delete-local"
              : "delete-remote",
          "Зеркало: файл отсутствует в источнике",
        );
      else if (source && source.hash !== target?.hash)
        emit(
          profile.direction === "pull" ? "download" : "upload",
          "Зеркало: содержимое источника имеет приоритет",
        );
      else emit("adopt", "Зеркало: содержимое совпадает");
      continue;
    }
    if (!l && !r) {
      emit("adopt", "Обе версии отсутствуют");
      continue;
    }
    if (l && r && l.hash === r.hash) {
      emit("adopt", "Содержимое совпадает");
      continue;
    }
    const samePair = !!b && l?.hash === b.local && r?.hash === b.remote;
    if (samePair && b!.policyKey === policyKey(profile)) {
      emit("adopt", "Эта пара версий уже обработана при той же политике");
      continue;
    }
    const lc = l?.hash !== b?.local,
      rc = r?.hash !== b?.remote;
    if (!l || !r) {
      const missingSide = !l ? "local" : "remote",
        hadMissing = !!b?.[missingSide];
      const presentChanged = !l ? rc : lc;
      const propagates =
        (!l && profile.direction !== "pull") ||
        (!r && profile.direction !== "push");
      if (hadMissing && propagates) {
        if (profile.deletion === "ignore") {
          emit(
            "skip",
            "Удаление не распространяется; исходная история сохраняется",
          );
          continue;
        }
        if (presentChanged && profile.deleteConflict === "ask") {
          emit("conflict", "Удаление против изменения");
          continue;
        }
        if (presentChanged && profile.deleteConflict === "keep") {
          if (profile.direction === "both")
            emit(
              l ? "upload" : "download",
              "Сохранить изменённый файл: восстановить другую сторону",
            );
          else
            emit("adopt", "Сохранить изменённый файл на принимающей стороне");
          continue;
        }
        emit(
          l ? "delete-local" : "delete-remote",
          "Подтверждённое удаление ранее синхронизированного файла",
        );
        continue;
      }
      if (l && profile.direction !== "pull")
        emit(
          "upload",
          hadMissing
            ? "Восстановить удалённую копию из локального источника"
            : "Новый локальный файл",
        );
      else if (r && profile.direction !== "push")
        emit(
          "download",
          hadMissing
            ? "Восстановить локальную копию из удалённого источника"
            : "Новый удалённый файл",
        );
      else emit("adopt", "Файл только на принимающей стороне: оставить");
      continue;
    }
    const conflict =
      !b || samePair || profile.conflictWhen === "any-difference" || (lc && rc);
    if (!conflict) {
      if (rc && profile.direction !== "push")
        emit("download", "Изменился только удалённый файл");
      else if (lc && profile.direction !== "pull")
        emit("upload", "Изменился только локальный файл");
      else
        emit(
          "skip",
          "Изменение на принимающей стороне: сохранить локальное отклонение",
        );
      continue;
    }
    let policy = profile.conflict;
    if (policy === "newest") {
      if (!l.mtime || !r.mtime || l.mtime === r.mtime) {
        emit("conflict", "Нет сопоставимого времени: выберите версию");
        continue;
      }
      policy = l.mtime > r.mtime ? "local" : "remote";
    }
    if (policy === "ask")
      emit(
        "conflict",
        !b
          ? "Первое подключение: разные существующие файлы"
          : "Изменились обе версии",
      );
    else if (policy === "both")
      emit("keep-both", "Сохранить проигрывающую версию в .sync-conflicts");
    else if (policy === "local")
      emit(
        profile.direction === "pull" ? "adopt" : "upload",
        "Выигрывает локальная версия",
      );
    else
      emit(
        profile.direction === "push" ? "adopt" : "download",
        "Выигрывает удалённая версия",
      );
  }
  // Copy the replacement before deleting the old path (rename fallback).
  // A failed transfer must not erase the receiving side's only existing copy.
  operations.sort(
    (a, b) =>
      Number(a.action.startsWith("delete-")) -
      Number(b.action.startsWith("delete-")),
  );
  return {
    id: crypto.randomUUID(),
    created: Date.now(),
    profile: structuredClone(profile),
    identity,
    operations,
    local,
    remote,
    baseline: structuredClone(baseline),
    warnings: [...local.warnings, ...remote.warnings],
  };
}
