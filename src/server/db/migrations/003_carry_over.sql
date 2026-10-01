-- Évelők átvitele az új tervévbe: az áthozott ültetés az előző évi rekordjára mutat.
-- Az áthozott ültetés január 1-jétől foglalja a helyét (vetés és kiültetés nélkül).
-- Szándékosan nincs idegen kulcs: ha az előző évi rekordot törlik, az áthozott ültetés
-- attól még áthozott marad (a jelölés a lényeg, nem a hivatkozás).

ALTER TABLE planting ADD COLUMN carried_from_id INTEGER;
CREATE INDEX planting_carried_idx ON planting(carried_from_id);
