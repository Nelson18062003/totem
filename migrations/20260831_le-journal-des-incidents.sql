-- LA PLATEFORME AUSSI A LE DROIT DE DIRE CE QUI S'EST PASSÉ.
--
-- Le terminal tient un journal : modem redémarré, SMS illisible, nuage
-- injoignable. Il le pousse ici, dans « evenements ». Et personne ne le lit
-- jamais — aucun écran ne l'affiche. On collectait pour jeter.
--
-- La plateforme, elle, n'écrivait rien du tout : ses pannes partaient dans la
-- sortie d'erreur de l'hébergeur, que le propriétaire n'ouvrira jamais. Quand
-- quelque chose casse un dimanche à Douala, il n'y a rien à lire.
--
-- Un incident de la plateforme n'appartient à AUCUN terminal — la base est
-- injoignable, une session a été refusée, un bilan a été coupé. La colonne
-- « terminal » devient donc facultative.
--
--     psql "$SUPABASE_DB_URL" -f migrations/20260831_le-journal-des-incidents.sql

alter table evenements alter column terminal drop not null;

comment on column evenements.terminal is
  'Le terminal concerné, ou NULL quand c''est la plateforme qui parle.';

-- ---------------------------------------------------------------------------
-- Vérification. On écrit VRAIMENT un incident sans terminal.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into evenements (terminal, source_id, texte, survenu_le)
  values (null, 0, 'essai de migration', now());
  delete from evenements where texte = 'essai de migration';
  raise notice 'La plateforme peut noter un incident sans terminal.';
end $$;
