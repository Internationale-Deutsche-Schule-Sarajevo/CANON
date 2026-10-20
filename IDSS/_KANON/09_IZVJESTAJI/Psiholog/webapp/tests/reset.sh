#!/bin/bash
set -e
pg_ctlcluster 16 main status >/dev/null 2>&1 || pg_ctlcluster 16 main start
sleep 1
D=$(cd "$(dirname "$0")/.." && pwd)
su postgres -c "psql -q -v ON_ERROR_STOP=1 -c 'drop database if exists psih_test' -c 'create database psih_test'"
for f in "$D/tests/00_okvir.sql" "$D/supabase/PSIH_1_BAZA.sql"; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d psih_test -f $f" >/dev/null
done
echo reset-ok
