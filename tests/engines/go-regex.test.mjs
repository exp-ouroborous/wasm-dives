import test from "node:test";
import { goEngine } from "./go-host.mjs";
import { CASES, checkCase } from "./regex-contract.mjs";

const analyze = await goEngine("regex");
test("go regex engine", { skip: analyze ? false : "run npm run build first (needs the cached Yaegi wasm)" }, async (t) => {
  for (const testCase of CASES) await t.test(testCase.name, () => checkCase("go", testCase, analyze));
});
