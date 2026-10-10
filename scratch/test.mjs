import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
const root=process.cwd(),base=path.join(root,"node_modules/.pnpm");
const pkg=fs.readdirSync(base).find(n=>n.startsWith("vitest@4.1.4_"));
const {startVitest}=await import(pathToFileURL(path.join(base,pkg,"node_modules/vitest/dist/node.js")));
const alias={"@":path.join(root,"apps/passenger-app-web"),"@drts/contracts":path.join(root,"packages/contracts/src/index.ts"),"@drts/control-plane-auth":path.join(root,"packages/control-plane-auth/src/index.ts"),"@drts/passenger-client":path.join(root,"packages/passenger-client/src/index.ts"),"@drts/ui-tokens":path.join(root,"packages/ui-tokens/src/index.ts"),"@drts/ui-web":path.join(root,"packages/ui-web/src/index.tsx")};
for(const name of ["@testing-library/react","@testing-library/dom","react","react-dom","next","zod","@nestjs/common","@nestjs/core","reflect-metadata","rxjs"]){const dir=fs.readdirSync(base).find(n=>n.startsWith(name.replaceAll("/","+")+"@")&&(name!=="react"||n==="react@19.3.0"));alias[name]=path.join(base,dir,"node_modules",name);}
const ctx=await startVitest("test",["tests/unit/pax-web-ride-ui-20261009","tests/unit/pax-web-shell-20261009/bff.test.ts"],{config:false,root,watch:false,cache:false,globals:true,environment:"jsdom",maxWorkers:1,include:["tests/unit/pax-web-ride-ui-20261009/**/*.test.tsx","tests/unit/pax-web-shell-20261009/bff.test.ts"]},{resolve:{alias},esbuild:{jsx:"automatic"},oxc:false});
if(ctx)await ctx.close();
