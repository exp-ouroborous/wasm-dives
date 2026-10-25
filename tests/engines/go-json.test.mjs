import test from "node:test";
import { goEngine } from "./go-host.mjs";
import { CASES, checkCase } from "./json-contract.mjs";

const analyze = await goEngine("json");
test("go json engine", { skip: analyze ? false : "run npm run build first (needs the cached Yaegi wasm)" }, async (t) => {
  for (const testCase of CASES) await t.test(testCase.name, () => checkCase("go", testCase, analyze));
});
