import { v4 as uuid } from "uuid";
import { getDB } from "./index";
import type { TestSuite, TestCase, Turn } from "@/lib/types";

const now = () => new Date().toISOString();

// ---- TestSuite ----

export async function listTestSuites(): Promise<TestSuite[]> {
  const items = await getDB().testSuites.toArray();
  return items.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1));
}

export async function getTestSuite(id: string): Promise<TestSuite | undefined> {
  return getDB().testSuites.get(id);
}

export async function createTestSuite(input: {
  name: string;
  description?: string;
  type: "single-turn" | "multi-turn";
}): Promise<TestSuite> {
  const ts = now();
  const suite: TestSuite = {
    id: uuid(),
    name: input.name,
    description: input.description ?? "",
    type: input.type,
    createdAt: ts,
    updatedAt: ts,
  };
  await getDB().testSuites.add(suite);
  return suite;
}

export async function updateTestSuite(
  id: string,
  patch: Partial<Pick<TestSuite, "name" | "description" | "type">>
): Promise<void> {
  await getDB().testSuites.update(id, { ...patch, updatedAt: now() });
}

export async function deleteTestSuite(id: string): Promise<void> {
  const db = getDB();
  const referencedRuns = await db.evalRuns.where("testSuiteId").equals(id).count();
  if (referencedRuns > 0) {
    throw new Error(`该测试集已被 ${referencedRuns} 个评估任务引用，不能删除`);
  }
  await db.transaction(
    "rw",
    db.testSuites,
    db.testCases,
    async () => {
      await db.testCases.where("testSuiteId").equals(id).delete();
      await db.testSuites.delete(id);
    }
  );
}

export async function touchTestSuite(id: string): Promise<void> {
  await getDB().testSuites.update(id, { updatedAt: now() });
}

// ---- TestCase ----

export async function listTestCases(testSuiteId: string): Promise<TestCase[]> {
  const items = await getDB()
    .testCases.where("testSuiteId")
    .equals(testSuiteId)
    .toArray();
  return items.sort((a, b) => a.order - b.order);
}

export async function countTestCases(testSuiteId: string): Promise<number> {
  return getDB().testCases.where("testSuiteId").equals(testSuiteId).count();
}

export async function createTestCase(input: {
  testSuiteId: string;
  input: string;
  expected?: string;
  tags?: string[];
  turns?: Turn[];
}): Promise<TestCase> {
  const order =
    (await getDB()
      .testCases.where("testSuiteId")
      .equals(input.testSuiteId)
      .count()) + 1;

  const tc: TestCase = {
    id: uuid(),
    testSuiteId: input.testSuiteId,
    input: input.input,
    expected: input.expected ?? "",
    tags: input.tags ?? [],
    order,
    turns: input.turns,
  };
  await getDB().testCases.add(tc);
  await touchTestSuite(input.testSuiteId);
  return tc;
}

export async function updateTestCase(
  id: string,
  patch: Partial<Pick<TestCase, "input" | "expected" | "tags" | "turns">>
): Promise<void> {
  const tc = await getDB().testCases.get(id);
  if (!tc) return;
  await getDB().testCases.update(id, patch);
  await touchTestSuite(tc.testSuiteId);
}

export async function deleteTestCase(id: string): Promise<void> {
  const db = getDB();
  const tc = await db.testCases.get(id);
  if (!tc) return;
  const referencedRuns = await db.evalRuns.where("testSuiteId").equals(tc.testSuiteId).count();
  if (referencedRuns > 0) {
    throw new Error(`该用例所属测试集已被 ${referencedRuns} 个评估任务引用，不能删除用例`);
  }
  await db.testCases.delete(id);
  await touchTestSuite(tc.testSuiteId);
}

export async function clearTestCases(testSuiteId: string): Promise<number> {
  const db = getDB();
  const referencedRuns = await db.evalRuns.where("testSuiteId").equals(testSuiteId).count();
  if (referencedRuns > 0) {
    throw new Error(`该测试集已被 ${referencedRuns} 个评估任务引用，不能清空用例`);
  }
  const count = await db
    .testCases.where("testSuiteId")
    .equals(testSuiteId)
    .delete();
  await touchTestSuite(testSuiteId);
  return count;
}

export async function bulkCreateTestCases(
  testSuiteId: string,
  cases: Array<{ input: string; expected?: string; tags?: string[] }>
): Promise<number> {
  const baseOrder = await countTestCases(testSuiteId);
  const ts = now();
  const records: TestCase[] = cases.map((c, i) => ({
    id: uuid(),
    testSuiteId,
    input: c.input,
    expected: c.expected ?? "",
    tags: c.tags ?? [],
    order: baseOrder + i + 1,
  }));
  await getDB().testCases.bulkAdd(records);
  await getDB().testSuites.update(testSuiteId, { updatedAt: ts });
  return records.length;
}

// ---- Stats ----

export async function getTestSuiteStats(): Promise<
  Record<string, { count: number }>
> {
  const all = await getDB().testCases.toArray();
  const map: Record<string, { count: number }> = {};
  for (const tc of all) {
    if (!map[tc.testSuiteId]) map[tc.testSuiteId] = { count: 0 };
    map[tc.testSuiteId].count++;
  }
  return map;
}
