import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  const parents = await prisma.parent.findMany({ include: { students: true } });
  return NextResponse.json({ success: true, parents });
}
