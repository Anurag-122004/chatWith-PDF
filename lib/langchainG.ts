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

async function fetchMessagesFromDB(docId: string) {
    const { userId } = await auth();
    if (!userId) {
    throw new Error("user not found");
    }

    console.log("--- Fetching chat History from the firestore-----");

    const chats = await adminDb
    .collection(`users`)
    .doc(userId)
    .collection("files")
    .doc(docId)
    .collection("chat")
    .orderBy("createdAt", "desc")
    //limit
    .get();

    const chatHistory = chats.docs.map((doc) => 
        doc.data().role === "human"
        ? new HumanMessage(doc.data().message)
        : new AIMessage(doc.data().message)
    );

    console.log(`---fetched last ${chatHistory.length} messages successfully`);

    console.log(chatHistory.map((msg) => msg.content.toString()));

    return chatHistory;
}

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
    } 
    else {
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

const generateLangchainCompletion = async (docId: string, question: string) => {

    let pineconeVectorStore;

    pineconeVectorStore = await generateEmbeddingInPineconeVectorStore(docId);

    if ( !pineconeVectorStore ) {
        throw new Error("Pinecone vector store not found");
    }
    
    //create a retriever to searxh through a vector store
    console.log("---------Creating a retriever...------");
    const retriever = pineconeVectorStore.asRetriever();

    const chatHistory = await fetchMessagesFromDB(docId);

    console.log("-----defining the prompt template");
    const historyAwarePrompt = ChatPromptTemplate.fromMessages([
        ...chatHistory,

        ["user", "{input}"],
        [
            "user",
            "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation",
        ],
    ]);

    //create a history aware retriever chain that uses the model , retriever and prompt 
    console.log("-----creting the retriever chain");
    const historyAwareRetrieverChain = await createHistoryAwareRetriever({
        llm: model,
        retriever,
        rephrasePrompt: historyAwarePrompt,
    });

    //define a prompt template for answering questions based on retrieved context
    console.log("----Defining the prompt template for answering questions -----");
    const historyAwareRetrievalPrompt = ChatPromptTemplate.fromMessages([
        [
            "system",
            "Answer the user's questions based on the below context:\n\n{context}",
        ],
        ...chatHistory, //insert the actual chat history 
        ["user", "{input}"],
    ]);

    //create a chain to combine documnets chain 
    console.log("----creating a document combining chain ---");
    const historyAwareCombineDocsChain = await createStuffDocumentsChain({
        llm: model,
        prompt: historyAwareRetrievalPrompt,
    });

    //create the main retrieval chain that combines the history-aware retriever and document combinng chain
    console.log("----creating the main retrieval chain ---");
    const conversationalRetrievalchain = await createRetrievalChain({
        retriever: historyAwareRetrieverChain,
        combineDocsChain: historyAwareCombineDocsChain,
    });

    console.log("--Running the chain with a sample convo---");
    const reply = await conversationalRetrievalchain.invoke({
        chat_history: chatHistory,
        input: question,
    });

    console.log("reply:", reply.answer);
    return reply.answer;
};

export { model, generateLangchainCompletion };