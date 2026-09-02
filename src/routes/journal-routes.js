import { Router } from "express";
import { createJournalController } from "../controllers/journal-controller.js";

export function createJournalRoutes() {
  const router = Router();
  const journalController = createJournalController();
  router.get("/journal", journalController.index);
  router.get("/journal/new", journalController.create);
  router.get("/journal/:id", journalController.publicEntry);
  return router;
}
