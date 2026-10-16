#!/bin/bash
# Pokreće SQL testove (iz direktorija tests/) nad svježom bazom.
cd "$(dirname "$0")" && ./reset.sh >/dev/null 2>&1
for f in "$@"; do su postgres -c "cd $PWD && psql -q -d idss_test -v ON_ERROR_STOP=1 -f $f" 2>&1; done
