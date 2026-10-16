#!/bin/bash
# Ponovo kreira testnu bazu i učitava sve SQL datoteke redom.
pg_lsclusters | grep -q online || { pg_ctlcluster 16 main start; sleep 4; }
set -e
cd "$(dirname "$0")/.."
su postgres -c "psql -q -c 'drop database if exists idss_test' -c 'create database idss_test'" 
su postgres -c "psql -q -d idss_test -v ON_ERROR_STOP=1 -f $PWD/supabase/00_testni_okvir.sql" 
for f in supabase/001_osnova.sql supabase/002_validacija_bodovi.sql supabase/003_rpc.sql supabase/004_sigurnost.sql; do
  [ -f "$f" ] && su postgres -c "psql -q -d idss_test -v ON_ERROR_STOP=1 -f $PWD/$f" || true
done
