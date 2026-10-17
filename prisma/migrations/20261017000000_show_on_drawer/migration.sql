-- Quick-buy drawers now have their own "show button on" choice. Until now a drawer followed the page it
-- opened on, so shops that show the button on a collection, search or home page keep their drawers.
UPDATE "Settings"
SET "showOn" = array_append("showOn", 'drawer')
WHERE NOT ('drawer' = ANY("showOn"))
  AND "showOn" && ARRAY['collection', 'search', 'home'];
