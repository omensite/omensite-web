import { buildPageViewModel } from "../models/view-models.js";

export function renderPage(req, res, page) {
  res.set({
    "X-Omensite-Path": page.data.path ?? page.route.path,
    "X-Omensite-Title": page.route.title,
    "X-Omensite-Key": page.route.key,
  });

  if (req.isOmensiteFragment) {
    return res.render(`pages/${page.route.view}`, { page });
  }

  return res.render("layouts/app", { pageView: page, page });
}

export function createPageController() {
  return {
    show(route, extras = {}) {
      return (req, res) => {
        const accessNotice = route.key === "home" && !req.isOmensiteFragment
          ? req.session.accessNotice
          : null;
        if (accessNotice) delete req.session.accessNotice;
        return renderPage(req, res, buildPageViewModel(route, {
          operator: req.session.operator,
          accessNotice,
          ...extras,
        }));
      };
    },
  };
}
