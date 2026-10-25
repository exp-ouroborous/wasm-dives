import test from "node:test";
import { goEngine } from "./go-host.mjs";
import { CASES, checkCase } from "./markdown-contract.mjs";

const convert = await goEngine("markdown");
test("go markdown engine", { skip: convert ? false : "run npm run build first (needs the cached Yaegi wasm)" }, async (t) => {
  for (const testCase of CASES) await t.test(testCase.name, () => checkCase("go", testCase, convert));
});
