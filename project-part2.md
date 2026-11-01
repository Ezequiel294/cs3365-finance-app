

### **CS 3365 - Fall 2026 Class Project High-level design and MVP** 

# Overview 

The second project deliverable will consist of generating all design artifacts required to meet the requirements expressed in deliverable 1, for one of the 4 products. This design should encompass **all of the requirements** . The design will be used to attempt a “one shot” implementation using at least two different code assistant models. 

# Objective 

The main purpose of this assignment is to be able to design software systems using modeling techniques and generate code based on that high level modeling exercise. 

# Detailed Requirements 

Students will select one of the 4 options they presented as part of the first delivery to continue the creation process of their application. Students are allowed to improve on the original specification. With that they will create: 

- A report that will include 

   - A cover section where they will express which of the 4 options they selected and a summary of the problem and high level comments derived from the 1-pagers. 

   - All diagrams outlined below 

   - A detailed description of all the iterations to change the diagrams in order to drive the coding agents to generate a working solution. This will be done with 2 different models. 

   - Pointers to a public github repo that the instructor can access to review their progress. 

   - Product backlog of remaining items for future iterations. 

   - Prompts used to trigger code generation. 

- A context model, that shows the different modular sections of the system 

- An architecture diagram, that calls out front end, backend, data layers, services, and all other software runtime elements that will be required by the system 

- Sequence diagrams, at least one per user story 

- A detailed class diagram that includes all classes that will be required to at least meet the requirements translated into sequence diagrams 

   - Students are expected to add UI/API controllers, database handlers, etc. 



   - They can be grouped by using the modules outlined in one of the two top level diagrams (i.e. context and architecture) 

- A github repository where diagrams will be added 

   - All of them need to be generated using mermaid and it is expected that pull requests will be used to manage the different modifications 

   - 1-pagers presented as part of the first project deliverable are allowed as part of the context 

- App deployment in a service like vercel or railway 

- A 10-minute presentation during class to demo the results 

With all the prior artifacts, students will attempt to generate a complete app, according to specification, in one shot. The only elements that students will be allowed to modify are the diagrams. They will try to iterate on modifications to the diagrams tracked with pull requests so that the history of those changes is preserved. Once a pull request is merged, it is expected that a full round of code generation happens. Students will be allowed to modify diagrams and generate the app up to 3 times. 

Assuming there will be gaps to finish the implementation, students will create a product backlog that should include enough stories to finish the application. These stories will not be addressed during the current project, but will be left for a third and final phase. It is expected that students should include backlog items that comply with recommendations from the textbooks. 

# Grading considerations 

This milestone is given a value of 15% of the semester grade. The document will be turned in physically during class, on November 12, 2026. Students will need to be prepared to present that day, although the instructor reserves the right to move the presentation to a later session. 

Each person will assign a grade to each of the other students in the team, which they will send directly to the instructor. This will be done via email. Please use the subject "CS3365 - Project 2 Teammate Grades - [Student Name]" with each of the grades that person assigns to the other students, on a scale from 0 to 100. Grades will not be assigned to a student who has not turned in their peer evaluation. These grades will be taken into account when assigning the final number of points for this milestone. 

## Rubric items 

In general, the expectation is that all the following design artifacts will be generated according to the textbook and best practices: 

- Context model 

- Architecture diagram 

- Sequence diagrams, one per user story 



- Class diagram 

- Repository access and history, preserved via pull requests ● Presentation and demo contents 

All diagrams should have accompanying textual descriptions and justifications as to why they are valuable to the design. 

For the backlog proposal the following will be graded: 

- Backlog items in the product backlog, according to book recommendations 

- Selection of stories to be executed during a hypothetical first sprint 

