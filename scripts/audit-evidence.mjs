/** Validate complete flat TAP evidence, independently of the child's exit status. */
export function auditEvidence(tap, expected, exitCode) {
  const rows = [...tap.matchAll(/^(ok|not ok) (\d+) - (.+)$/gm)].map(m => ({passed:m[1]==='ok',number:Number(m[2]),name:m[3]}));
  const summary = name => {
    const matches = [...tap.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))];
    return matches.length === 1 ? Number(matches[0][1]) : undefined;
  };
  const plans = [...tap.matchAll(/^1\.\.(\d+)$/gm)];
  const errors = [];
  if (new Set(expected.map(c=>c.id)).size !== expected.length || new Set(expected.map(c=>c.name)).size !== expected.length || !expected.length) errors.push('invalid-case-registry');
  if (plans.length !== 1 || Number(plans[0][1]) !== expected.length) errors.push('missing-or-wrong-plan');
  if (rows.length !== expected.length || rows.some((row,i)=>row.number!==i+1) || new Set(rows.map(r=>r.name)).size !== rows.length) errors.push('missing-or-duplicate-results');
  if (rows.some(row=>!expected.some(c=>c.name===row.name)) || expected.some(c=>!rows.some(row=>row.name===c.name))) errors.push('scenario-set-mismatch');
  if (summary('tests') !== expected.length || summary('pass') !== rows.filter(r=>r.passed).length || summary('fail') !== rows.filter(r=>!r.passed).length) errors.push('missing-or-inconsistent-summary');
  for (const name of ['cancelled','skipped','todo']) if (summary(name) !== 0) errors.push(`nonzero-or-missing-${name}`);
  const complete = errors.length === 0;
  return {complete,status:complete&&exitCode===0&&rows.every(row=>row.passed)?'pass':'fail',exitCode,errors,
    scenarios:expected.map(c=>({...c,status:rows.find(r=>r.name===c.name)?.passed===true?'pass':rows.some(r=>r.name===c.name)?'fail':'not-run'}))};
}
