import { ROUTE_BY_KEY } from "../models/navigation.js";
import { buildPageViewModel } from "../models/view-models.js";
import { renderPage } from "./page-controller.js";

export function createJournalController() {
  return {
    index(req, res) {
      return renderPage(req, res, buildPageViewModel(ROUTE_BY_KEY.journal, { operator: req.session.operator }));
    },
    create(req, res) {
      return renderPage(req, res, buildPageViewModel(ROUTE_BY_KEY["journal-new"], { operator: req.session.operator }));
    },
    publicEntry(req, res) {
      return renderPage(req, res, buildPageViewModel(ROUTE_BY_KEY["journal-public"], {
        operator: req.session.operator,
        data: { entryId: req.params.id, path: req.path },
      }));
    },
  };
}
