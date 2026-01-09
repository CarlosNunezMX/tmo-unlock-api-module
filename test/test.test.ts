import { TMO } from "../src";
import { expect, test } from "bun:test"

const client = new TMO.Client();
await client.login();

const imei = process.env["IMEI"];
if (!imei) throw "Wanted an IMEI by enviroment";


test("Eligibility", async () => {
  const res = await client.getEligibility(imei, TMO.Eligibility.Type.PERMANENT);
  expect(res.transactionId).toBeNumber();
  expect(res.currentUnlockStatus).toBeBoolean();
  expect(res.unlockType).toBeString();
})

