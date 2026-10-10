"""Generates the sample roster exports used by the import tests and the demo.

    python3 scripts/fixtures/make-import-fixtures.py [out_dir]

Writes list/grid layouts as CSV (UTF-8 with BOM, Windows-1252) and XLSX
(openpyxl with real date/time cells). A LibreOffice conversion is added when
`soffice` is available, to cover a second XLSX writer.
"""
import csv, datetime as dt, os, shutil, subprocess, sys, tempfile
from openpyxl import Workbook

out = sys.argv[1] if len(sys.argv) > 1 else 'src/domain/integration/__fixtures__'
os.makedirs(out, exist_ok=True)
Y, M = 2026, 11

# list layout: one row per shift (typical "Dienstliste" export)
rows = [
    ['P-1001', 'Becker, Anna', '02.11.2026', 'F', '06:00', '14:15', '30'],
    ['P-1001', 'Becker, Anna', '03.11.2026', 'S', '13:45', '22:00', '30'],
    ['P-1002', 'Weber, Jonas', '02.11.2026', 'N', '21:45', '06:15', '45'],
    ['P-1003', 'Yılmaz, Leyla', '04.11.2026', 'FD', '', '', ''],
    ['P-1003', 'Yılmaz, Leyla', '05.11.2026', 'U', '', '', ''],
]
header = ['Personalnummer', 'Name', 'Datum', 'Dienst', 'Beginn', 'Ende', 'Pause']
with open(f'{out}/dienstliste.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, delimiter=';', quoting=csv.QUOTE_MINIMAL)
    w.writerow(header)
    w.writerows(rows)

# Windows-1252, comma, ISO dates, quoted name with comma, English headers
with open(f'{out}/roster-cp1252.csv', 'w', encoding='cp1252', newline='') as f:
    w = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL)
    w.writerow(['Employee ID', 'Last name', 'First name', 'Date', 'Shift', 'Start', 'End'])
    w.writerow(['P-1004', 'Müller-Schulz', 'Mira', '2026-11-02', 'F', '6:00', '14:15'])
    w.writerow(['P-1004', 'Müller-Schulz', 'Mira', '2026-11-03', 'N', '9:45 PM', '6:15 AM'])

# list layout as XLSX with real date and time cells
wb = Workbook()
ws = wb.active
ws.title = 'Dienstplan'
ws.append(['Dienstplan Station 3A – November 2026'])  # title row above the header
ws.append(header)
for pnr, name, d, code, b, e, p in rows:
    day = dt.datetime.strptime(d, '%d.%m.%Y').date()
    ws.append([pnr, name, day, code,
               dt.datetime.strptime(b, '%H:%M').time() if b else None,
               dt.datetime.strptime(e, '%H:%M').time() if e else None,
               int(p) if p else None])
wb.save(f'{out}/dienstliste.xlsx')

# grid layout: one row per person, one column per day
wb = Workbook()
ws = wb.active
ws.title = 'November'
ws.append(['Pers.-Nr.', 'Mitarbeiter'] + [f'{d:02d}.' for d in range(1, 31)])
pattern = ['F', 'F', 'S', 'S', 'N', 'N', '-']
for i, (pnr, name) in enumerate([('P-1001', 'Becker, Anna'), ('P-1002', 'Weber, Jonas'), ('P-1003', 'Yılmaz, Leyla')]):
    ws.append([pnr, name] + [pattern[(d + 2 * i) % 7] for d in range(30)])
wb.save(f'{out}/dienstplan-raster.xlsx')

if shutil.which('soffice'):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'raster.csv')
        with open(src, 'w', encoding='utf-8', newline='') as f:
            w = csv.writer(f, delimiter=',')
            w.writerow(['Personalnummer', 'Name'] + [str(d) for d in range(1, 31)])
            w.writerow(['P-1001', 'Becker, Anna'] + [pattern[d % 7] for d in range(30)])
        subprocess.run(['soffice', '--headless', '--convert-to', 'xlsx', '--outdir', tmp, src],
                       check=True, capture_output=True, timeout=120)
        shutil.copy(os.path.join(tmp, 'raster.xlsx'), f'{out}/raster-libreoffice.xlsx')
print('fixtures written to', out)
