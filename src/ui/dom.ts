import { i18n } from '../i18n';
export const tr = (ru: string, en: string): string => i18n.getLocale() === 'ru' ? ru : en;
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = ''): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag); node.textContent = text; node.className = cls; return node;
}
export function button(parent: HTMLElement, label: string, action: () => void, cls = ''): HTMLButtonElement {
    const node = element('button', label, cls); node.type = 'button'; node.addEventListener('click', action); parent.append(node); return node;
}
export function field(parent: HTMLElement, label: string, control: HTMLElement, help = ''): HTMLElement {
    const row = element('div', '', 'sync-field'); const name = element('label', label);
    control.id ||= 'sync-field-' + crypto.randomUUID(); name.htmlFor = control.id; row.append(name, control);
    control.dataset.syncField=label;
    if (help) { const description = element('small', help); description.id = control.id + '-help'; control.setAttribute('aria-describedby', description.id); row.append(description); }
    parent.append(row); return row;
}
export function textInput(value: string, change: (value: string) => void): HTMLInputElement {
    const input = element('input'); input.type = 'text'; input.value = value; input.addEventListener('input', () => change(input.value)); return input;
}
export function selectInput(options: readonly (readonly [string, string])[], value: string, change: (value: string) => void): HTMLSelectElement {
    const select = element('select');
    for (const [key, label] of options) { const option = element('option', label); option.value = key; select.append(option); }
    setSelectValue(select,value);
    select.addEventListener('change', () => change(select.value)); return select;
}
export function setSelectValue(select:HTMLSelectElement,value:string):void {
    for(const option of Array.from(select.options))option.selected=false;
    const chosen=Array.from(select.options).find(option=>option.value===value);if(chosen)chosen.selected=true;
}
