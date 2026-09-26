import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning database...');
  await prisma.paymentAttempt.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.student.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.trialClass.deleteMany();

  console.log('Seeding Parents & Students...');
  // Parent 1 & Student 1
  const parent1 = await prisma.parent.create({
    data: {
      id: 'parent_1',
      name: 'Alice Smith',
      email: 'alice@example.com',
      students: {
        create: [
          { id: 'student_1', name: 'Leo Smith', age: 8 }
        ]
      }
    }
  });

  // Parent 2 & Student 2
  const parent2 = await prisma.parent.create({
    data: {
      id: 'parent_2',
      name: 'Bob Johnson',
      email: 'bob@example.com',
      students: {
        create: [
          { id: 'student_2', name: 'Maya Johnson', age: 9 }
        ]
      }
    }
  });

  // Parent 3 & Student 3
  const parent3 = await prisma.parent.create({
    data: {
      id: 'parent_3',
      name: 'Charlie Brown',
      email: 'charlie@example.com',
      students: {
        create: [
          { id: 'student_3', name: 'Sam Brown', age: 7 }
        ]
      }
    }
  });

  // Parent 4 & Student 4 (Race condition candidate A)
  const parent4 = await prisma.parent.create({
    data: {
      id: 'parent_4',
      name: 'David Miller (User A)',
      email: 'david@example.com',
      students: {
        create: [
          { id: 'student_4', name: 'Emma Miller', age: 8 }
        ]
      }
    }
  });

  // Parent 5 & Student 5 (Race condition candidate B)
  const parent5 = await prisma.parent.create({
    data: {
      id: 'parent_5',
      name: 'Eva Green (User B)',
      email: 'eva@example.com',
      students: {
        create: [
          { id: 'student_5', name: 'Noah Green', age: 10 }
        ]
      }
    }
  });

  // Parent 6 & Student 6 (Payment failure trigger test)
  const parent6 = await prisma.parent.create({
    data: {
      id: 'parent_6',
      name: 'Frank Fail (Payment Failure Test)',
      email: 'frank@example.com',
      students: {
        create: [
          { id: 'student_6', name: 'Fail Child', age: 8 }
        ]
      }
    }
  });

  console.log('Seeding Trial Classes...');
  // Case 1: Class with available seats (0 confirmed)
  const classAvailable = await prisma.trialClass.create({
    data: {
      id: 'class_available',
      title: 'Fun Science Experiment 101',
      subject: 'Science',
      startTime: new Date(Date.now() + 86400000), // Tomorrow
      maxCapacity: 4
    }
  });

  // Case 2: Class with 3 confirmed students (1 seat left)
  const classAlmostFull = await prisma.trialClass.create({
    data: {
      id: 'class_almost_full',
      title: 'Primary Math Challenge',
      subject: 'Math',
      startTime: new Date(Date.now() + 172800000), // 2 days later
      maxCapacity: 4
    }
  });

  console.log('Seeding Existing Bookings...');
  // 3 Confirmed students in class_almost_full
  await prisma.booking.create({
    data: {
      id: 'booking_seed_1',
      trialClassId: classAlmostFull.id,
      parentId: parent1.id,
      studentId: 'student_1',
      status: 'confirmed',
      payments: {
        create: [{ amount: 2000, status: 'success' }]
      }
    }
  });

  await prisma.booking.create({
    data: {
      id: 'booking_seed_2',
      trialClassId: classAlmostFull.id,
      parentId: parent2.id,
      studentId: 'student_2',
      status: 'confirmed',
      payments: {
        create: [{ amount: 2000, status: 'success' }]
      }
    }
  });

  await prisma.booking.create({
    data: {
      id: 'booking_seed_3',
      trialClassId: classAlmostFull.id,
      parentId: parent3.id,
      studentId: 'student_3',
      status: 'confirmed',
      payments: {
        create: [{ amount: 2000, status: 'success' }]
      }
    }
  });

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
