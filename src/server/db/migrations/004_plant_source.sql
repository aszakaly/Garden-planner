-- A kezdő növényadatok forrás-megjelölése pontosabb lett: a vetési időszakok a magyar vetési
-- naptárakból valók, a tő- és sortáv és a tenyészidő nem (az általános kertészeti alapérték).
-- Csak a változatlanul hagyott (az eredeti szöveget viselő) növényeket érinti.

UPDATE plant
SET source = 'Vetési, kiültetési és betakarítási időszak: magyar vetési naptárak (kertvar.hu, agroinform.hu, kertlap.hu). '
          || 'Tő- és sortáv, tenyészidő: általános kertészeti alapérték, ahol volt adat, összevetve a Rédei Kertimag tasakadataival, '
          || 'az origo.hu házikerti helyigény-táblázatával és a kertforum.hu tenyészidő-táblázatával.'
WHERE source = 'Alapadat: magyar vetési naptárak (kertvar.hu, agroinform.hu, kertlap.hu) alapján összeállítva';
