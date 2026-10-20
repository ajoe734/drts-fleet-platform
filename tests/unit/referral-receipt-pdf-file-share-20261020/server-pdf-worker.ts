import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type {
  ReferralPassengerReceipt,
  ReferralPassengerReceiptPdfDocument,
} from "@drts/contracts";
/** Run the two whole real server-renderer modules in an actual Node process.
 * The parent still executes the real controller/service/serializer/BFF/client;
 * stdio only replaces the process boundary, not any PDF or business logic. */
export function renderInNode(
  receipt: ReferralPassengerReceipt,
): ReferralPassengerReceiptPdfDocument {
  const root = process.cwd();
  const api = path.join(root, "apps/api");
  const receiptFile = path.join(
    api,
    "src/modules/owned-mobility/referral-receipt-document.ts",
  );
  const billingFile = path.join(
    api,
    "src/modules/billing-settlement/billing-document-pdf.renderer.ts",
  );
  const fontFile = path.join(api, "assets/fonts/NotoSansCJKtc-Regular.otf");
  const input = {
    receipt,
    root,
    receiptFile,
    billingFile,
    fontFile,
    receiptSource: fs.readFileSync(receiptFile, "utf8"),
    billingSource: fs.readFileSync(billingFile, "utf8"),
  };
  const program = String.raw`
 const fs=require('node:fs'),Module=require('node:module'),crypto=require('node:crypto');
 const input=JSON.parse(fs.readFileSync(0,'utf8')),requireRoot=Module.createRequire(input.root+'/package.json'),ts=requireRoot('typescript');
 const font=fs.readFileSync(input.fontFile);
 function load(source,filename,overrides={}){const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(require('node:path').dirname(filename));const original=m.require.bind(m);m.require=name=>name in overrides?overrides[name]:original(name);const code=ts.transpileModule(source,{fileName:filename,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;m._compile(code,filename);return m.exports;}
 const billing=load(input.billingSource,input.billingFile);
 const renderer=load(input.receiptSource,input.receiptFile,{'../billing-settlement/billing-document-pdf.renderer':billing});
 const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
 renderer.renderReferralReceiptDocument(input.receipt).then(document=>process.stdout.write(JSON.stringify({document,proof:{orderId:input.receipt.orderId,receiptSha256:hash(JSON.stringify(input.receipt)),fullReceiptModuleSha256:hash(input.receiptSource),fullBillingModuleSha256:hash(input.billingSource),fontSha256:hash(font),fontBytes:font.byteLength,documentSha256:document.sha256,fullModulesExecuted:2}}))).catch(error=>{process.stderr.write(error.stack);process.exitCode=1;});
 `;
  const output = JSON.parse(
    execFileSync(process.execPath, ["-e", program], {
      cwd: root,
      input: JSON.stringify(input),
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    }),
  );
  if (process.env.REFERRAL_PDF_WORKER_PROOF)
    fs.appendFileSync(
      process.env.REFERRAL_PDF_WORKER_PROOF,
      JSON.stringify(output.proof) + "\n",
    );
  return output.document;
}
