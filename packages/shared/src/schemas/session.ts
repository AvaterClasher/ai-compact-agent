import { z } from "zod";

export const createSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().optional(),
});

export const updateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  model: z.string().optional(),
  status: z.enum(["active", "compacting", "archived"]).optional(),
});
