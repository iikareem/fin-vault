INSERT INTO "Category" ("id", "householdId", "name", "kind", "color")
SELECT "id" || '_peer_loan', "id", 'Personal loan', 'PEER', '#57534e'
FROM "Household" WHERE "kind" = 'HOUSE'
ON CONFLICT ("householdId", "name", "kind") DO NOTHING;

INSERT INTO "Category" ("id", "householdId", "name", "kind", "color")
SELECT "id" || '_peer_help', "id", 'Help with a bill', 'PEER', '#a16207'
FROM "Household" WHERE "kind" = 'HOUSE'
ON CONFLICT ("householdId", "name", "kind") DO NOTHING;
