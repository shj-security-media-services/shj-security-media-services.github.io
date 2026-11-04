// Display-only helpers. A selected DEMO role never grants application permissions.
export const text = (value, lang) => typeof value === 'object' ? value?.[lang] || '' : String(value ?? '');
export function roleFor(config, id) {
  return Object.hasOwn(config.roles, id) ? id : config.defaults.role;
}
export function itemsFor(config, role) {
  const mil = config.roles[role].mil;
  return config.items.filter(item => item.for.includes(mil));
}
export function search(config, role, query, lang) {
  const q = query.trim().normalize('NFKC').toLocaleLowerCase(lang);
  if (!q) return [];
  const r = config.roles[role];
  const rows = [
    ...r.shortcuts.map(id => ({ id, title: config.services[id].title, sub: config.copy.service })),
    ...itemsFor(config, role).map(item => ({ id: item.id, title: item.title, sub: item.sub })),
    ...config.people.filter(person => person.mil === r.mil).map(person => ({ id: person.mil, title: person.name, sub: { ar: person.mil, en: person.mil } }))
  ];
  return rows.filter(row => [text(row.title, lang), text(row.sub, lang), row.id].join(' ').normalize('NFKC').toLocaleLowerCase(lang).includes(q));
}
export function initialState(config, params) {
  return {
    role: roleFor(config, params.get('role')),
    lang: config.languages.includes(params.get('lang')) ? params.get('lang') : config.defaults.lang,
    theme: config.themes.includes(params.get('theme')) ? params.get('theme') : config.defaults.theme
  };
}
export function validSnapshot(value, config) {
  // Cache only identifiers of bundled DEMO records; never accept cached labels or HTML.
  return value?.schema === config.schema && Array.isArray(value.ids) &&
    value.ids.length === config.items.length && new Set(value.ids).size === value.ids.length &&
    value.ids.every(id => config.items.some(item => item.id === id));
}
