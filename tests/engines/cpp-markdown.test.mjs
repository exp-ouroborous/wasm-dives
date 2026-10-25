import test from "node:test";
import { cppEngine } from "./cpp-host.mjs";
import { CASES, checkCase } from "./markdown-contract.mjs";

const convert = await cppEngine("markdown");
for (const testCase of CASES) test(`c++ markdown: ${testCase.name}`, () => checkCase("cpp", testCase, convert));
