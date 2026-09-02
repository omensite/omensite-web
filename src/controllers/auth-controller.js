export function createAuthController({ authService }) {
  return {
    async login(req, res, next) {
      try {
        const operator = await authService.authenticate(req.body ?? {});
        req.session.regenerate((error) => {
          if (error) {
            return next(error);
          }

          req.session.operator = operator;
          return res.json({ ok: true, redirectTo: "/home" });
        });
      } catch (error) {
        if (error.code === "CREDENTIALS_REQUIRED") {
          return res.status(400).json({ error: error.code });
        }
        return next(error);
      }
    },

    logout(req, res, next) {
      req.session.destroy((error) => {
        if (error) {
          return next(error);
        }
        return res.json({ ok: true, redirectTo: "/login" });
      });
    },
  };
}
