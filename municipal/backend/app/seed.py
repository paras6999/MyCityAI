"""Development seed data: wards and one staff account per role.

Run from municipal/backend:  python -m app.seed
Safe to run more than once (existing rows are left alone).
All staff accounts get the password from SEED_STAFF_PASSWORD in .env.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_secret
from app.models import User, Ward

# Sample ward list for the prototype (not official ward boundaries).
WARDS = [
    (1, "Shivaji Peth"),
    (2, "Kasaba Bawada"),
    (3, "Mangalwar Peth"),
    (4, "Shaniwar Peth"),
    (5, "Ravivar Peth"),
    (6, "Budhwar Peth"),
    (7, "Mahadwar Road"),
    (8, "Laxmipuri"),
    (9, "Sykes Extension"),
    (10, "Nagala Park"),
    (11, "Shahupuri"),
    (12, "Rajarampuri"),
    (13, "Kadamwadi"),
    (14, "Kasba Bavda East"),
    (15, "Jawahar Nagar"),
    (16, "Tarabai Park"),
    (17, "Ruikar Colony"),
    (18, "Rankala"),
    (19, "Shivaji University Area"),
    (20, "Ujalaiwadi"),
]

# (username, display name, role, department, ward number)
STAFF = [
    ("admin", "System Admin", "admin", None, None),
    ("mayor", "Mayor's Office", "mayor", None, None),
    ("officer.water", "Er. S. Kulkarni", "officer", "water", None),
    ("officer.roads", "Er. V. Patil", "officer", "roads", None),
    ("officer.waste", "R. Jadhav", "officer", "waste", None),
    ("officer.electricity", "A. Shinde", "officer", "electricity", None),
    ("officer.drainage", "M. Pawar", "officer", "drainage", None),
    ("officer.health", "Dr. K. More", "officer", "health", None),
    ("wardrep.7", "Ward 7 Representative", "ward_rep", None, 7),
    ("wardrep.11", "Ward 11 Representative", "ward_rep", None, 11),
    ("wardrep.12", "Ward 12 Representative", "ward_rep", None, 12),
    ("wardrep.16", "Ward 16 Representative", "ward_rep", None, 16),
]


def seed(db: Session) -> tuple[int, int]:
    added_wards = 0
    for number, name in WARDS:
        if db.scalar(select(Ward).where(Ward.number == number)) is None:
            db.add(Ward(number=number, name=name))
            added_wards += 1
    db.flush()

    ward_ids = {w.number: w.id for w in db.scalars(select(Ward))}
    password_hash = hash_secret(get_settings().seed_staff_password)
    added_users = 0
    for username, name, role, department, ward_number in STAFF:
        if db.scalar(select(User).where(User.username == username)) is None:
            db.add(
                User(
                    username=username,
                    name=name,
                    role=role,
                    department=department,
                    ward_id=ward_ids.get(ward_number) if ward_number else None,
                    password_hash=password_hash,
                    language="en",
                )
            )
            added_users += 1
    db.commit()
    return added_wards, added_users


if __name__ == "__main__":
    with SessionLocal() as session:
        wards, users = seed(session)
    print(f"Seed complete: {wards} wards and {users} staff users added.")
