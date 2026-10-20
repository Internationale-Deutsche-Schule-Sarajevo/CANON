-- Dijagnostika: sve tri stavke moraju biti u redu
select 'korisnik u Authentication' as stavka, email, (email_confirmed_at is not null)::text as stanje from auth.users where lower(email) in ('psiholog@idss.ba','direktor@idss.ba')
union all
select 'profil u aplikaciji', u.email, p.uloga || ' / aktivan=' || p.aktivan from psih.profili p join auth.users u on u.id = p.id
union all
select 'neradnih dana u kalendaru', '', count(*)::text from psih.neradni_dani
order by 1, 2;
