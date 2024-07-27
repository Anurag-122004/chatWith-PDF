"use server";

import { generateEmbeddingInPineconeVectorStore } from "@/lib/langchainG";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function generateEmbeddings(docId: string) {
    auth().protect();

    await generateEmbeddingInPineconeVectorStore(docId);

    revalidatePath('/dashboard');

    return { completed: true };
}