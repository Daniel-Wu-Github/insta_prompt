import { Hono } from "hono";

import { enhanceRouteHandler } from "../services/routeHandlers";

export const enhanceRoutes = new Hono();

enhanceRoutes.post("/", enhanceRouteHandler);

