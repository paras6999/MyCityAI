"""Development seed data.

Run from municipal/backend:
    python -m app.seed          # wards + one staff account per role
    python -m app.seed --demo   # also a demo citizen and sample complaints

Safe to run more than once (existing rows are left alone).
All staff accounts get the password from SEED_STAFF_PASSWORD in .env.
"""

import random
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_secret
from app.models import Complaint, User, Ward
from app.schemas.complaint import ComplaintUpdate
from app.services.complaints import create_complaint, update_complaint

# Sample wards with approximate centre points (not official boundaries).
WARDS = [
    (1, "Shivaji Peth", 16.6935, 74.2215),
    (2, "Kasaba Bawada", 16.7298, 74.2415),
    (3, "Mangalwar Peth", 16.6970, 74.2260),
    (4, "Shaniwar Peth", 16.6960, 74.2300),
    (5, "Ravivar Peth", 16.6990, 74.2330),
    (6, "Budhwar Peth", 16.7010, 74.2280),
    (7, "Mahadwar Road", 16.6955, 74.2375),
    (8, "Laxmipuri", 16.7005, 74.2385),
    (9, "Sykes Extension", 16.6930, 74.2480),
    (10, "Nagala Park", 16.7145, 74.2435),
    (11, "Shahupuri", 16.7060, 74.2445),
    (12, "Rajarampuri", 16.6968, 74.2530),
    (13, "Kadamwadi", 16.7230, 74.2520),
    (14, "Kasba Bavda East", 16.7320, 74.2500),
    (15, "Jawahar Nagar", 16.6880, 74.2400),
    (16, "Tarabai Park", 16.7110, 74.2510),
    (17, "Ruikar Colony", 16.6890, 74.2560),
    (18, "Rankala", 16.6905, 74.2140),
    (19, "Shivaji University Area", 16.6770, 74.2560),
    (20, "Ujalaiwadi", 16.6650, 74.2670),
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

DEMO_CITIZEN_PHONE = "+919800000001"

# (category, ward number, hours ago, priority, final status, description)
DEMO_COMPLAINTS = [
    ("pipeline_burst", 7, 2, 96, "assigned", "Main pipeline burst, water flooding the road"),
    ("no_water_supply", 12, 30, 88, "in_progress", "No water supply for 3 days in our lane"),
    ("contaminated_water", 3, 8, 85, "in_progress", "Tap water is yellow and smells bad"),
    ("water_leakage", 15, 5, 71, "new", "Leakage near the school gate"),
    ("water_leakage", 9, 20, 58, "new", "Low pressure and a small leak at the valve"),
    ("pothole", 12, 26, 82, "assigned", "Big pothole near bus stop, two-wheelers falling at night"),
    ("pothole", 16, 60, 64, "new", "Pothole outside Tarabai Park garden"),
    ("road_damage", 11, 10, 45, "new", "Road surface broken after cable work"),
    ("fallen_tree", 18, 3, 77, "new", "Tree fell across the lake road"),
    ("garbage", 12, 30, 74, "new", "Garbage not collected for 5 days"),
    ("illegal_dumping", 7, 12, 52, "assigned", "Construction debris dumped on footpath"),
    ("streetlight", 12, 80, 40, "in_progress", "Street light not working on 3rd lane"),
    ("power_outage", 13, 4, 90, "new", "Power cut in the whole colony since morning"),
    ("drainage_overflow", 12, 22, 79, "new", "Drainage overflowing onto the road"),
    ("waterlogging", 2, 6, 68, "new", "Water collects near the underpass after rain"),
    ("stray_animals", 16, 40, 35, "new", "Stray dogs chasing children near the park"),
    ("other", 10, 1, 30, "new", "Broken bench in the public garden"),
]


def seed(db: Session) -> tuple[int, int]:
    added_wards = 0
    for number, name, lat, lng in WARDS:
        ward = db.scalar(select(Ward).where(Ward.number == number))
        if ward is None:
            db.add(Ward(number=number, name=name, center_lat=lat, center_lng=lng))
            added_wards += 1
        elif ward.center_lat is None:
            ward.center_lat, ward.center_lng = lat, lng
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


def seed_demo(db: Session) -> int:
    """Sample complaints for trying the dashboard. Skipped if any complaints exist."""
    if db.scalar(select(func.count(Complaint.id))):
        return 0
    citizen = db.scalar(select(User).where(User.phone == DEMO_CITIZEN_PHONE))
    if citizen is None:
        citizen = User(phone=DEMO_CITIZEN_PHONE, name="Demo Citizen", role="citizen", language="en")
        db.add(citizen)
        db.flush()

    wards = {w.number: w for w in db.scalars(select(Ward))}
    officers = {u.department: u for u in db.scalars(select(User).where(User.role == "officer"))}
    rng = random.Random(42)
    now = datetime.now(UTC)

    for category, ward_number, hours_ago, priority, status, description in DEMO_COMPLAINTS:
        ward = wards[ward_number]
        complaint = create_complaint(
            db,
            reporter=citizen,
            category=category,
            lat=ward.center_lat + rng.uniform(-0.002, 0.002),
            lng=ward.center_lng + rng.uniform(-0.002, 0.002),
            description=description,
            address=f"Near {ward.name}",
            created_at=now - timedelta(hours=hours_ago),
        )
        complaint.priority_score = priority  # stands in for the AI score until Phase 4
        officer = officers.get(complaint.department)
        if status in ("assigned", "in_progress") and officer:
            update_complaint(db, complaint, officer, ComplaintUpdate(assigned_to_id=officer.id))
        if status == "in_progress" and officer:
            update_complaint(
                db, complaint, officer, ComplaintUpdate(status="in_progress", note="Team on site")
            )
    db.commit()
    return len(DEMO_COMPLAINTS)


if __name__ == "__main__":
    with SessionLocal() as session:
        wards, users = seed(session)
        print(f"Seed complete: {wards} wards and {users} staff users added.")
        if "--demo" in sys.argv:
            print(f"Demo data: {seed_demo(session)} complaints added.")
