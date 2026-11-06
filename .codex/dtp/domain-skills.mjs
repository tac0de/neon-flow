const registryPath = '.codex/domain-skills.json';
const stringList = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());

function validSkill(skill) {
  return skill && typeof skill.id === 'string' && /^[a-z][a-z0-9-]*$/.test(skill.id) &&
    typeof skill.version === 'string' && /^\d+\.\d+\.\d+$/.test(skill.version) &&
    typeof skill.title === 'string' && skill.title.trim() &&
    stringList(skill.appliesTo?.paths) && stringList(skill.appliesTo?.terms) &&
    stringList(skill.instructions) && skill.instructions.length > 0 &&
    stringList(skill.contract?.inputs) && stringList(skill.contract?.outputs);
}

export function loadDomainSkills(git, revision) {
  if (!git(['ls-tree', '--name-only', revision, '--', registryPath]).trim()) return [];
  const registry = JSON.parse(git(['show', `${revision}:${registryPath}`]));
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.skills) || !registry.skills.every(validSkill) ||
      new Set(registry.skills.map(skill => skill.id)).size !== registry.skills.length) {
    throw new Error('도메인 스킬 레지스트리의 형식, 버전 또는 스킬 ID가 올바르지 않습니다.');
  }
  return registry.skills;
}

export function resolveDomainSkills(skills, { paths = [], query = '' } = {}) {
  const candidates = paths.map(path => path.replace(/^\.\//, ''));
  const text = query.toLowerCase();
  return skills.filter(({ appliesTo }) => {
    if (candidates.length) {
      return appliesTo.paths.some(rule => candidates.some(path => (
        rule.endsWith('/') ? path.startsWith(rule) : path === rule
      )));
    }
    return appliesTo.paths.some(rule => text.includes(rule.toLowerCase())) ||
      appliesTo.terms.some(term => text.includes(term.toLowerCase()));
  });
}
