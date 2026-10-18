import { prisma } from "../config/prisma.js";

export function listerProgrammesActifs() {
  return prisma.programme.findMany({
    where: { actif: true },
    orderBy: { nom: "asc" },
    select: { id: true, nom: true },
  });
}
