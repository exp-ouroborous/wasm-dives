import test from "node:test";
import { goEngine } from "./go-host.mjs";
import { CASES, checkCase } from "./diff-contract.mjs";

const diff = await goEngine("diff");
test("go diff engine", { skip: diff ? false : "run npm run build first (needs the cached Yaegi wasm)" }, async (t) => {
  for (const testCase of CASES) await t.test(testCase.name, () => checkCase("go", testCase, diff));
});
