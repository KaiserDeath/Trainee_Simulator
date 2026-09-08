// Parses the PostgREST select syntax used across the codebase into a tree.
//
//   'id, username'
//   '*, customer:sandbox_customers(id, balance)'
//   'identity_id, hub_roles!inner(code)'
//   'id, hub_role_assignments(hub_roles(code))'
//   '*, postulante:hub_identities!hub_assessment_attempts_identity_id_fkey(id)'
//
// A node is either a column or an embed. Embeds carry the alias, the target
// table, whether the join is inner, and any explicitly named foreign key.

function splitTopLevel(input) {
  const parts = [];
  let depth = 0;
  let current = '';

  for (const character of input) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;

    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim() !== '') parts.push(current);
  if (depth !== 0) throw new Error(`Unbalanced parentheses in select: ${input}`);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseHeader(header) {
  // [alias:]table[!inner|!constraint_name]
  let alias = null;
  let name = header.trim();

  const colon = name.indexOf(':');
  if (colon !== -1) {
    alias = name.slice(0, colon).trim();
    name = name.slice(colon + 1).trim();
  }

  let inner = false;
  let foreignKey = null;
  const bang = name.indexOf('!');
  if (bang !== -1) {
    const hint = name.slice(bang + 1).trim();
    name = name.slice(0, bang).trim();
    if (hint === 'inner') inner = true;
    else if (hint === 'left') inner = false;
    else foreignKey = hint;
  }

  return { alias: alias || name, table: name, inner, foreignKey };
}

export function parseSelect(selectString) {
  const raw = selectString === undefined || selectString === null ? '*' : String(selectString);
  const trimmed = raw.trim() === '' ? '*' : raw;

  const columns = [];
  const embeds = [];

  for (const part of splitTopLevel(trimmed)) {
    const open = part.indexOf('(');
    if (open === -1) {
      columns.push(part.trim());
      continue;
    }

    if (!part.endsWith(')')) {
      throw new Error(`Unbalanced embed in select: ${part}`);
    }

    const header = parseHeader(part.slice(0, open));
    const body = part.slice(open + 1, -1);
    const child = parseSelect(body);

    embeds.push({
      ...header,
      columns: child.columns,
      embeds: child.embeds,
    });
  }

  return { columns, embeds };
}

export function selectHasEmbeds(selectString) {
  return parseSelect(selectString).embeds.length > 0;
}
