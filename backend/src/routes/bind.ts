import { Hono } from "hono";

import { bindRouteHandler } from "../services/routeHandlers";

export const bindRoutes = new Hono();

bindRoutes.post("/", bindRouteHandler);

