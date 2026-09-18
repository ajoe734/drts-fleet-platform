const babel = require('@babel/core');
const files = [
  'docs/05-ui/drts-design-canvas/fleet-cases.jsx',
  'docs/05-ui/drts-design-canvas/fleet-host.jsx',
  'docs/05-ui/drts-design-canvas/fleet-screens.jsx',
];
for (const f of files) {
  try {
    babel.transformFileSync(f, { presets: [require.resolve('@babel/preset-react')], babelrc: false, configFile: false });
    console.log('OK', f);
  } catch (e) {
    console.log('FAIL', f, e.message);
  }
}
