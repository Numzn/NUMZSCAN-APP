import { Router } from "express";
import { requireDevice } from "../access.js";
import { parse } from "../validation.js";
import { errorFor, processScan, scanSchema } from "../scanService.js";

// Scanner devices record scans here. The rules are in scanService.js, shared with staff scanning.
export function interactionsRouter({ pool, config }) {
  const router = Router();

  router.post("/interactions", requireDevice, async (req, res, next) => {
    const device = req.principal.device;
    const client = await pool.connect();
    let result;
    try {
      const body = parse(scanSchema, req.body);
      await client.query("begin");
      result = await processScan(client, {
        tokenKey: config.tokenKey,
        eventId: device.eventId,
        recorder: { kind: "device", device },
        deviceScope: { checkpointId: device.checkpointId },
        body,
      });
      await client.query("commit");
    } catch (err) {
      await client.query("rollback").catch(() => {});
      client.release();
      return next(err);
    }
    client.release();

    const error = errorFor(result.interaction.outcome, result.interaction.reason);
    if (error) return next(error);
    return res.status(result.replayed ? 200 : 201).json({ interaction: result.interaction, replayed: result.replayed });
  });

  return router;
}
