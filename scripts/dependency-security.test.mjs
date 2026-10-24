import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
const lock=JSON.parse(readFileSync(new URL("../package-lock.json",import.meta.url),"utf8"));
const root=lock.packages?.[""];
const packages=lock.packages??{};

test("Nodemailer is pinned to the addressparser security release",()=>{
 assert.equal(pkg.dependencies.nodemailer,"10.1.4");
 assert.equal(root.dependencies.nodemailer,pkg.dependencies.nodemailer);
 const node=packages["node_modules/nodemailer"];
 assert.equal(node?.version,"10.1.4");
 assert.equal(node.resolved,"https://registry.npmjs.org/nodemailer/-/nodemailer-10.1.4.tgz");
 assert.equal(node.integrity,"sha512-EsMnOR2oRv4LGnWvHgcVYkkQ4O2j8KO4WTw6l+PHR4sOXo8SAgIraxtEnGDmotjbhv0hDsu3IuDIFZm8iXwO4A==");
});

test("The transitive Zod validation dependency cannot regress to an affected release",()=>{
 assert.equal(pkg.overrides?.zod,"4.6.6");
 const node=packages["node_modules/zod"];
 assert.equal(node?.version,"4.6.6");
 assert.equal(node.resolved,"https://registry.npmjs.org/zod/-/zod-4.6.6.tgz");
 assert.equal(node.integrity,"sha512-4UmzQUF5fxvfcYHlbjBmejU+w+hbDnWFx4aS8kBx7nPBHcO2SqPbpAG8snbdg+Xse4pRefR98hgjFgIMCI/UhA==");
});

test("The lockfile has no additional old Zod or Nodemailer versions",()=>{
 const hits=Object.entries(packages).filter(([key])=>/(?:^|\\/)node_modules\\/(?:zod|nodemailer)$/.test(key));
 assert.deepEqual(hits.map(([key])=>key).sort(),["node_modules/nodemailer","node_modules/zod"]);
 assert.deepEqual(hits.map(([,node])=>node.version).sort(),["10.1.4","4.6.6"]);
});
