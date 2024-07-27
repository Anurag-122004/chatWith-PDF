import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import pineconeClient from "./pincone";
import { PineconeStore } from "@langchain/pinecone";
import { PineconeConflictError } from "@pinecone-database/pinecone/dist/errors";
import { Index, RecordMetadata } from "@pinecone-database/pinecone";
import { adminDb } from "../firebaseAdmin";
import { auth } from "@clerk/nextjs/server";

const model = new ChatGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    modelName: "gemini-1.5-pro",
    maxOutputTokens: 2048,
    safetySettings: [
    {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
    },
    ],
});
export const indexName = "anuragprotwo";

export async function generateDocs(docId: string) {

    const { userId } = await auth();
    if (!userId) {
    throw new Error("user not found");

}
console.log("---- fetching the download URL from firebase... ---");
const firebaseRef = await adminDb
.collection("users")
.doc(userId)
.collection("files")
.doc(docId)
.get();

const downloadUrl = firebaseRef.data()?.doneloadURL;

if (!downloadUrl) {
throw new Error("Download URL not found");
}
console.log(`--- downloading url fetched successfully: ${downloadUrl} ---`);
const res = await fetch(downloadUrl);
const data = await res.blob();
console.log("--- Loading PDF document.... ----");
const loader = new PDFLoader(data);
const docs = await loader.load();
const splitter = new RecursiveCharacterTextSplitter();
const splitDocs = await splitter.splitDocuments(docs);
console.log(`--- Split into ${splitDocs.length} parts ---`);
return splitDocs;
}
async function NamespaceExist(index: Index<RecordMetadata>, namespace: string) {
if (namespace === null) throw new Error("No namespace value provided.");
const { namespaces } = await index.describeIndexStats();
return namespaces?.[namespace] !== undefined;
}
export async function generateEmbeddingInPineconeVectorStore(docId: string) {
const { userId } = await auth();
if (!userId) {
throw new Error("user not found");
}
let pineconeVectorStore;
console.log("---Generating Embeddings... ---");
const embeddings = new GoogleGenerativeAIEmbeddings({
apiKey: process.env.GEMINI_API_KEY,
modelName: "embedding-001",
});
const index = await pineconeClient.index(indexName);
const nameSpaceAlreadyExist = await NamespaceExist(index, docId);
if (nameSpaceAlreadyExist) {
console.log(
`--- Namespace ${docId} already exists, reusing existing embeddings.... ---`
);
pineconeVectorStore = await PineconeStore.fromExistingIndex(embeddings, {
pineconeIndex: index,
namespace: docId,
});
return pineconeVectorStore;
} else {
const splitDocs = await generateDocs(docId);
console.log(
`---- Storing the embeddings in namespace ${docId} in the ${indexName} Pinecone vector store.....`
);
pineconeVectorStore = await PineconeStore.fromDocuments(splitDocs, embeddings, {
namespace: docId,
pineconeIndex: index,
});
return pineconeVectorStore;
}
}
// Additional functions (createRetrievalChain, createHistoryAwareRetriever, etc.) would need to be implemented here,
// potentially with adjustments for Gemini API specifics