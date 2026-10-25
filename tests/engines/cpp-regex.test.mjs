import test from "node:test";
import { cppEngine } from "./cpp-host.mjs";
import { CASES, checkCase } from "./regex-contract.mjs";

const analyze = await cppEngine("regex");
for (const testCase of CASES) test(`c++ regex: ${testCase.name}`, () => checkCase("cpp", testCase, analyze));
