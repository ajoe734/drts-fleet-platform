const fs = require('fs');
const p = 'apps/passenger-app-web/components/p5-ui.tsx';
let content = fs.readFileSync(p, 'utf8');

content = content.replace(/export function P5Btn\(\{\n  kind = "secondary",\n  icon,\n  children,\n  danger,\n  onClick,\n\}\:/g, 
`export function P5Btn({
  kind = "secondary",
  icon,
  children,
  danger,
  disabled,
  onClick,
}:`);

fs.writeFileSync(p, content);
