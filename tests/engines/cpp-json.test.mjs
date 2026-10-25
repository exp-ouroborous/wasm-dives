import test from "node:test";
import { cppEngine } from "./cpp-host.mjs";
import { CASES, checkCase } from "./json-contract.mjs";

const analyze = await cppEngine("json");
for (const testCase of CASES) test(`c++ json: ${testCase.name}`, () => checkCase("cpp", testCase, analyze));
