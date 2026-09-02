export function fragmentRequest(req, res, next) {
  req.isOmensiteFragment = req.get("X-Omensite-Fragment") === "1";
  next();
}
