from sqlalchemy import create_engine
engine = create_engine("postgresql://solaros:solaros@localhost/solaros_test")
with engine.connect() as conn:
    print(conn.execute("SELECT to_regclass('vendors')").scalar())
