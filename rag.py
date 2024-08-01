from langchain_community.llms import Ollama
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.chains import RetrievalQA
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.cache import InMemoryCache
from langchain.globals import set_llm_cache
import sys
import json
import os

set_llm_cache(InMemoryCache())

def process_jsonl(file_path):
    vectorstore_path = "faiss_index"
    if os.path.exists(vectorstore_path):
        embeddings = OllamaEmbeddings(model="llama3")
        vectorstore = FAISS.load_local(vectorstore_path, embeddings, allow_dangerous_deserialization=True)
        llm = Ollama(model="llama3")
        return RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=vectorstore.as_retriever())

    llm = Ollama(model="llama3")
    embeddings = OllamaEmbeddings(model="llama3")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    
    texts = []
    with open(file_path, 'r') as file:
        for line in file:
            email = json.loads(line)
            full_text = f"Email {len(texts)+1} - Subject: {email['subject']}\n\nContent: {email['content']}"
            chunks = text_splitter.split_text(full_text)
            texts.extend(chunks)
    
    vectorstore = FAISS.from_texts(texts, embeddings)
    vectorstore.save_local(vectorstore_path)
    
    return RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=vectorstore.as_retriever())

def answer_question(qa_chain, question):
    print(f"Starting to answer question: {question}", file=sys.stderr)
    try:
        answer = qa_chain.invoke({"query": question})
        print("Successfully got answer from qa_chain", file=sys.stderr)
        return json.dumps({"answer": answer['result']})
    except Exception as e:
        print(f"Error in answer_question: {str(e)}", file=sys.stderr)
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    operation = sys.argv[1]
    file_path = sys.argv[2]
    qa_chain = process_jsonl(file_path)
    
    if operation == "process":
        print(json.dumps({"status": "processed"}))
    elif operation == "query":
        question = sys.argv[2]
        file_path = sys.argv[3]
        print(answer_question(qa_chain, question))
    else:
        print(json.dumps({"error": "Invalid operation"}))