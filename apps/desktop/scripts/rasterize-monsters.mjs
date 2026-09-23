import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";

const dir = path.resolve("../../packages/monsters-srd/images");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".svg"));
let ok = 0;
let fail = 0;
for (const f of files) {
  try {
    const svgPath = path.join(dir, f);
    const svg = fs.readFileSync(svgPath);
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 256 } });
    const png = resvg.render().asPng();
    const out = path.join(dir, f.slice(0, -4) + ".png");
    fs.writeFileSync(out, png);
    ok += 1;
  } catch (e) {
    fail += 1;
    console.error("FAIL", f, e);
  }
}
console.log({ ok, fail, orcPng: fs.existsSync(path.join(dir, "orc.png")) });
