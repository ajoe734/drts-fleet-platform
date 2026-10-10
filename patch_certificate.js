const fs = require("fs");
const file = "apps/passenger-app-web/components/ride/passenger-ride-page.tsx";
let code = fs.readFileSync(file, "utf8");

const replacement = `      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <a
          href={\`/api/passenger-app/rides/\${token}/receipt?format=html\`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 1, textAlign: "center", padding: "8px", borderRadius: 8, border: \`1px solid \${passengerChrome.border}\`, textDecoration: "none", color: passengerChrome.driverRealm.fg, fontSize: 13 }}
        >
          下載 HTML
        </a>
        <a
          href={\`/api/passenger-app/rides/\${token}/receipt?format=pdf\`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 1, textAlign: "center", padding: "8px", borderRadius: 8, border: \`1px solid \${passengerChrome.border}\`, textDecoration: "none", color: passengerChrome.driverRealm.fg, fontSize: 13 }}
        >
          下載 PDF
        </a>
      </div>
    </Card>
  );
}
`;

code = code.replace(
  `        </div>
      ))}
    </Card>
  );
}
`,
  `        </div>
` + replacement,
);

fs.writeFileSync(file, code);
