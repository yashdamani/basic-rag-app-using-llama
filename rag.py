from langchain_community.llms import Ollama
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.chains import RetrievalQA
from langchain.text_splitter import RecursiveCharacterTextSplitter
import sys
import json

def process_jsonl(file_path):
    llm = Ollama(model="llama3")
    embeddings = OllamaEmbeddings(model="llama3")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    
    texts = []
    with open(file_path, 'r') as file:
        for line in file:
            email = json.loads(line)
            # Combine subject and content for each email
            full_text = f"Subject: {email['subject']}\n\nContent: {email['content']}"
            chunks = text_splitter.split_text(full_text)
            texts.extend(chunks)
    
    vectorstore = Chroma.from_texts(texts, embeddings)
    qa_chain = RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=vectorstore.as_retriever())
    return qa_chain

def answer_question(qa_chain, question):
    print(f"Starting to answer question: {question}", file=sys.stderr)
    try:
        answer = qa_chain.invoke({"query": question})
        print("Successfully got answer from qa_chain", file=sys.stderr)
        return json.dumps({"answer": answer})
    except Exception as e:
        print(f"Error in answer_question: {str(e)}", file=sys.stderr)
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    operation = sys.argv[1]
    if operation == "process":
        file_path = sys.argv[2]
        qa_chain = process_jsonl(file_path)
        print(json.dumps({"status": "processed"}))
    elif operation == "query":
        question = sys.argv[2]
        file_path = sys.argv[3]
        qa_chain = process_jsonl(file_path)
        print(answer_question(qa_chain, question))
    else:
        print(json.dumps({"error": "Invalid operation"}))