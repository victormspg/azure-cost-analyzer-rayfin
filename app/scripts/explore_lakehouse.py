"""Explore the AzureCostAnalyzer Lakehouse SQL analytics endpoint (read-only).

Prereqs:
  pip install pyodbc azure-identity
  ODBC Driver 18 for SQL Server installed
  az login  (already done)

Set the SQL endpoint FQDN (copy from Lakehouse > SQL analytics endpoint > Settings > SQL connection string):
  $env:FABRIC_SQL_SERVER = "<your-endpoint>.datawarehouse.fabric.microsoft.com"
  $env:FABRIC_SQL_DB     = "AzureCostAnalyzer_LH"   # (default)

Usage:
  python scripts/explore_lakehouse.py                 # list all tables
  python scripts/explore_lakehouse.py <table_name>    # columns + 5 sample rows
"""

import os
import sys
import struct

import pyodbc
from azure.identity import AzureCliCredential

SERVER = os.environ.get("FABRIC_SQL_SERVER", "")
DATABASE = os.environ.get("FABRIC_SQL_DB", "AzureCostAnalyzer_LH")
SQL_COPT_SS_ACCESS_TOKEN = 1256  # from msodbcsql.h


def connect() -> "pyodbc.Connection":
    token = AzureCliCredential().get_token("https://database.windows.net/.default").token
    tb = token.encode("utf-16-le")
    ts = struct.pack(f"<I{len(tb)}s", len(tb), tb)
    conn_str = (
        "Driver={ODBC Driver 18 for SQL Server};"
        f"Server={SERVER};Database={DATABASE};Encrypt=yes;TrustServerCertificate=no;"
    )
    return pyodbc.connect(conn_str, attrs_before={SQL_COPT_SS_ACCESS_TOKEN: ts})


def list_tables(cur) -> None:
    cur.execute(
        """
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
        """
    )
    print("=== TABLES ===")
    for r in cur.fetchall():
        print(f"  {r.TABLE_SCHEMA}.{r.TABLE_NAME}")


def describe(cur, table: str) -> None:
    cur.execute(
        """
        SELECT COLUMN_NAME, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
        """,
        table,
    )
    print(f"=== COLUMNS: {table} ===")
    for c in cur.fetchall():
        print(f"  {c.COLUMN_NAME}  ({c.DATA_TYPE})")

    print(f"\n=== SAMPLE (TOP 5): {table} ===")
    cur.execute(f"SELECT TOP 5 * FROM [{table}]")
    colnames = [d[0] for d in cur.description]
    for row in cur.fetchall():
        print({k: v for k, v in zip(colnames, row)})


def main() -> None:
    if not SERVER:
        print("Set FABRIC_SQL_SERVER to the Lakehouse SQL endpoint FQDN first.")
        sys.exit(1)
    conn = connect()
    cur = conn.cursor()
    if len(sys.argv) > 1:
        describe(cur, sys.argv[1])
    else:
        list_tables(cur)


if __name__ == "__main__":
    main()
