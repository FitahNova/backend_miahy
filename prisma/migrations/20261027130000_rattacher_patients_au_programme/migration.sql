-- Rattache au programme MIAHY de leur âge et de leur sexe les patients créés
-- sans programme : ils n'apparaissaient alors dans aucun programme.
-- Les nouveaux patients sont désormais rattachés automatiquement par le service.
UPDATE "patient" AS p
SET "programme_id" = prog."id"
FROM "programme" AS prog
WHERE p."programme_id" IS NULL
  AND prog."actif" = true
  AND prog."nom" = CASE
    WHEN date_part('year', age(p."date_naissance")) < 16 THEN 'Ankizy'
    WHEN date_part('year', age(p."date_naissance")) <= 25 THEN 'Tanora'
    WHEN date_part('year', age(p."date_naissance")) > 60 THEN 'Zokiolona'
    WHEN p."sexe" = 'F' THEN 'Vehivavy'
    ELSE 'Lehilahy'
  END;
