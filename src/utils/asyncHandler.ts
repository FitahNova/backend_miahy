import type { NextFunction, Request, RequestHandler, Response } from "express";

export function gererAsync(
  fonction: (requete: Request, reponse: Response, suivant: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (requete, reponse, suivant) => {
    fonction(requete, reponse, suivant).catch(suivant);
  };
}